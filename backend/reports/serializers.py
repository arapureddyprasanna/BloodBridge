from rest_framework import serializers


class ReportOverviewSerializer(serializers.Serializer):
    total_users = serializers.IntegerField()
    active_users = serializers.IntegerField()
    total_donors = serializers.IntegerField()
    total_hospitals = serializers.IntegerField()
    total_communities = serializers.IntegerField()

    total_requests = serializers.IntegerField()
    active_requests = serializers.IntegerField()
    fulfilled_requests = serializers.IntegerField()
    cancelled_requests = serializers.IntegerField()
    fulfillment_rate = serializers.FloatField()

    blood_group_distribution = serializers.ListField(
        child=serializers.DictField()
    )
    urgency_distribution = serializers.ListField(
        child=serializers.DictField()
    )
    status_distribution = serializers.ListField(
        child=serializers.DictField()
    )
    monthly_requests = serializers.ListField(
        child=serializers.DictField()
    )