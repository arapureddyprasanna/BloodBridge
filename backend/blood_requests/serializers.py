from rest_framework import serializers

from .models import BloodRequest


class BloodRequestMonitorSerializer(serializers.ModelSerializer):
    hospital_name = serializers.CharField(
        source="hospital.full_name",
        read_only=True,
    )
    hospital_email = serializers.EmailField(
        source="hospital.email",
        read_only=True,
    )

    class Meta:
        model = BloodRequest
        fields = [
            "id",
            "hospital",
            "hospital_name",
            "hospital_email",
            "blood_group",
            "units_required",
            "urgency",
            "status",
            "hospital_notes",
            "required_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class HospitalBloodRequestSerializer(serializers.ModelSerializer):
    hospital = serializers.PrimaryKeyRelatedField(
        read_only=True,
    )
    hospital_name = serializers.CharField(
        source="hospital.full_name",
        read_only=True,
    )

    class Meta:
        model = BloodRequest
        fields = [
            "id",
            "hospital",
            "hospital_name",
            "blood_group",
            "units_required",
            "urgency",
            "status",
            "hospital_notes",
            "required_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "hospital",
            "hospital_name",
            "status",
            "created_at",
            "updated_at",
        ]

    def validate_units_required(self, value):
        if value < 1:
            raise serializers.ValidationError(
                "Units required must be at least 1."
            )
        return value


class BloodRequestStatsSerializer(serializers.Serializer):
    total = serializers.IntegerField()
    open = serializers.IntegerField()
    matching = serializers.IntegerField()
    urgent = serializers.IntegerField()
    fulfilled = serializers.IntegerField()


class BloodRequestPaginationSerializer(serializers.Serializer):
    page = serializers.IntegerField()
    page_size = serializers.IntegerField()
    total_items = serializers.IntegerField()
    total_pages = serializers.IntegerField()
    has_next = serializers.BooleanField()
    has_previous = serializers.BooleanField()


class BloodRequestMonitorListResponseSerializer(serializers.Serializer):
    stats = BloodRequestStatsSerializer()
    results = BloodRequestMonitorSerializer(many=True)
    pagination = BloodRequestPaginationSerializer()